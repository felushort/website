import Link from "next/link";
import { Card } from "../../components/ui/card";
import { LoginForm } from "../../components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-xl font-semibold">Sign in to ServerForge</h1>
        <LoginForm />
        <p className="mt-4 text-sm text-muted-foreground">
          Need an account? <Link href="/signup" className="text-primary">Create one</Link>
        </p>
      </Card>
    </div>
  );
}
