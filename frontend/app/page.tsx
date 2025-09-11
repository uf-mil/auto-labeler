// app/page.tsx
import { redirect } from "next/navigation";

export default function Root() {
  redirect("/projects-page"); // later: should first go to login and then projects-page
}
