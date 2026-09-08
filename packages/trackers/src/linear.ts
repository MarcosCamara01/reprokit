import type { TicketRef, TicketSnapshot } from "@atrium/domain";
import type { IssueTracker } from "./types";
import { TrackerNotImplementedError } from "./types";

export const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

export type LinearGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

export type LinearAgentActivityContent =
  | { type: "thought"; body: string }
  | { type: "elicitation"; body: string }
  | { type: "response"; body: string }
  | { type: "error"; body: string }
  | { type: "action"; action: string; parameter: string; result?: string };

export type LinearTrackerOptions = {
  accessToken: string;
  fetch?: typeof fetch;
  apiUrl?: string;
  agentSessionId?: string | null;
  runUrl?: string | null;
};

type IssueQueryData = {
  issue: {
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    url: string;
    team?: { id: string; name?: string } | null;
    project?: { id: string; name?: string } | null;
    labels?: { nodes?: Array<{ name?: string }> };
  } | null;
};

export class LinearTracker implements IssueTracker {
  readonly id = "linear" as const;

  constructor(private readonly options: LinearTrackerOptions) {}

  async getIssue(ref: TicketRef): Promise<TicketSnapshot> {
    const data = await this.graphql<IssueQueryData>(
      `query GetIssue($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          description
          url
          team { id name }
          project { id name }
          labels { nodes { name } }
        }
      }`,
      { id: ref.externalId || ref.identifier },
    );
    const issue = data.issue;
    if (!issue) {
      throw new TrackerNotImplementedError("linear", "getIssue (issue not found)");
    }
    return {
      ref: {
        provider: "linear",
        externalId: issue.id,
        identifier: issue.identifier,
      },
      url: issue.url,
      title: issue.title,
      body: issue.description ?? "",
      kind: "unknown",
      labels: (issue.labels?.nodes ?? []).map((node) => node.name ?? "").filter(Boolean),
    };
  }

  async postComment(ref: TicketRef, body: string): Promise<void> {
    await this.graphql(
      `mutation CommentCreate($input: CommentCreateInput!) {
        commentCreate(input: $input) { success }
      }`,
      { input: { issueId: ref.externalId, body } },
    );
  }

  async requestInfo(ref: TicketRef, questions: string[]): Promise<void> {
    const lines = [
      "Need more information before Atrium can run:",
      ...questions.map((question) => `- ${question}`),
    ];
    if (this.options.runUrl) {
      lines.push("", `Run: ${this.options.runUrl}`);
    }
    await this.postComment(ref, lines.join("\n"));
    if (this.options.agentSessionId) {
      await this.postAgentActivity({
        type: "elicitation",
        body: questions.join("\n\n"),
      });
    }
  }

  async linkPr(
    ref: TicketRef,
    pr: { url: string; title: string; runUrl?: string },
  ): Promise<void> {
    await this.graphql(
      `mutation AttachmentCreate($input: AttachmentCreateInput!) {
        attachmentCreate(input: $input) { success }
      }`,
      {
        input: {
          issueId: ref.externalId,
          url: pr.url,
          title: pr.title,
        },
      },
    );
    const runUrl = pr.runUrl ?? this.options.runUrl;
    const comment = runUrl
      ? `Opened [${pr.title}](${pr.url})\n\nAtrium run: ${runUrl}`
      : `Opened [${pr.title}](${pr.url})`;
    await this.postComment(ref, comment);
    if (this.options.agentSessionId) {
      await this.updateAgentSession({
        externalUrls: [
          { label: "Pull request", url: pr.url },
          ...(runUrl ? [{ label: "Atrium run", url: runUrl }] : []),
        ],
      });
      await this.postAgentActivity({
        type: "response",
        body: `Opened [${pr.title}](${pr.url})`,
      });
    }
  }

  async postAgentActivity(content: LinearAgentActivityContent): Promise<void> {
    const sessionId = this.options.agentSessionId;
    if (!sessionId) return;
    await this.graphql(
      `mutation AgentActivityCreate($input: AgentActivityCreateInput!) {
        agentActivityCreate(input: $input) { success }
      }`,
      { input: { agentSessionId: sessionId, content } },
    );
  }

  async updateAgentSession(input: {
    externalUrls?: Array<{ label: string; url: string }>;
  }): Promise<void> {
    const sessionId = this.options.agentSessionId;
    if (!sessionId) return;
    await this.graphql(
      `mutation AgentSessionUpdate($id: String!, $input: AgentSessionUpdateInput!) {
        agentSessionUpdate(id: $id, input: $input) { success }
      }`,
      { id: sessionId, input },
    );
  }

  async viewerWorkspace(): Promise<{
    organization: { id: string; name: string; urlKey: string };
    viewer: { id: string; name?: string };
    teams: Array<{ id: string; key: string; name: string }>;
  }> {
    const data = await this.graphql<{
      organization: { id: string; name: string; urlKey: string };
      viewer: { id: string; name?: string };
      teams: { nodes: Array<{ id: string; key: string; name: string }> };
    }>(
      `query ViewerWorkspace {
        organization { id name urlKey }
        viewer { id name }
        teams { nodes { id key name } }
      }`,
    );
    return {
      organization: data.organization,
      viewer: data.viewer,
      teams: data.teams.nodes,
    };
  }

  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const fetchFn = this.options.fetch ?? fetch;
    const response = await fetchFn(this.options.apiUrl ?? LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: linearAuthHeader(this.options.accessToken),
      },
      body: JSON.stringify({ query, variables }),
    });
    const payload = (await response.json()) as LinearGraphqlResponse<T>;
    if (!response.ok || payload.errors?.length) {
      const message = payload.errors?.map((err) => err.message).filter(Boolean).join("; ");
      throw new Error(message || `Linear GraphQL failed (${response.status})`);
    }
    if (!payload.data) {
      throw new Error("Linear GraphQL returned no data");
    }
    return payload.data;
  }
}

export function linearAuthHeader(accessToken: string): string {
  return accessToken.startsWith("Bearer ") ? accessToken : `Bearer ${accessToken}`;
}
