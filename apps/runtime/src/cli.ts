import { hostname } from "node:os";
import { joinMachine } from "./client";
import { saveCredentials } from "./credentials";
import { runSupervisor } from "./supervisor";

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);

  if (cmd === "supervisor" || cmd === undefined) {
    await runSupervisor();
    return;
  }

  if (cmd === "machine" && rest[0] === "join") {
    const code = argValue(rest, "--code") ?? rest[1];
    const url = argValue(rest, "--url") ?? process.env.ATRIUM_URL;
    const name = argValue(rest, "--name") ?? hostname();
    if (!code || !url) {
      console.error("usage: atrium machine join --code <6-digit> --url <https://app>");
      process.exit(1);
    }
    const joined = await joinMachine({ url, code, name });
    const path = saveCredentials({
      token: joined.token,
      machineId: joined.machineId,
      url,
      name,
    });
    console.log(`joined machine ${joined.machineId}`);
    console.log(`credentials: ${path}`);
    return;
  }

  console.error("usage: atrium supervisor | atrium machine join --code NNNNNN --url URL");
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
