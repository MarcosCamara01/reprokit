import { defineSandbox, defaultBackend, type SandboxNetworkPolicy } from "eve/sandbox";

const firewallPolicy: SandboxNetworkPolicy = {
  allow: [
    "github.com",
    "api.github.com",
    "*.githubusercontent.com",
    "objects.githubusercontent.com",
    "registry.npmjs.org",
    "*.npmjs.org",
  ],
  subnets: { deny: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"] },
};

export default defineSandbox({
  backend: defaultBackend({
    vercel: { networkPolicy: firewallPolicy },
    microsandbox: { networkPolicy: firewallPolicy },
    // Eve's Docker backend currently supports only coarse network policies.
    // Keep Docker usable for local worker development; hosted deployments should
    // use Vercel/microsandbox firewall policies for token-free GitHub checkout.
    docker: { networkPolicy: "allow-all" },
  }),
});
