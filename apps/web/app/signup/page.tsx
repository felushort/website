import Link from "next/link";
import { Card } from "../../components/ui/card";
import { SignupForm } from "../../components/auth/signup-form";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-xl font-semibold">Create your ServerForge account</h1>
        <SignupForm />
        <p className="mt-4 text-sm text-muted-foreground">
          Already registered? <Link href="/login" className="text-primary">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
