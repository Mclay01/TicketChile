import { redirect } from "next/navigation";
export default function OrganizerVerifyPage(){redirect("/security?kind=ORGANIZER&operation=verify-email");}
