import { redirect } from "next/navigation";
import { getStaff } from "@/lib/staff-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MyPasswordForm, MyProfileForm } from "@/components/admin/my-account-forms";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  administrator: "Administrator",
  operations: "Operations",
};

export default async function MyAccountPage() {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login");

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-navy-950">My Account</h1>
          <Badge variant="outline">{ROLE_LABEL[staff.role] ?? staff.role}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Update your own name, email, and password.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Profile</CardTitle>
          <CardDescription>Your name and login email.</CardDescription>
        </CardHeader>
        <CardContent>
          <MyProfileForm name={staff.name} email={staff.email} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Password</CardTitle>
          <CardDescription>Enter your current password to set a new one.</CardDescription>
        </CardHeader>
        <CardContent>
          <MyPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
