import { redirect } from "next/navigation";
import { getSession } from "@/lib/workspace";

export default async function HomePage() {
  const session = await getSession();
  redirect(session ? "/board" : "/login");
}
