import { LoginForm } from "./LoginForm";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <LoginForm errorParam={error} />
    </div>
  );
}
