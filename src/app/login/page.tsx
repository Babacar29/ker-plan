"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <Input name="email" type="email" placeholder="Email" required />
            <Input name="motDePasse" type="password" placeholder="Mot de passe" required />
            {state?.erreur && <p className="text-sm text-destructive">{state.erreur}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Connexion…" : "Se connecter"}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            Pas de compte ? <Link href="/signup" className="underline">Créer un compte</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
