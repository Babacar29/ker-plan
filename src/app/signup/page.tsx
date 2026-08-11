"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signupAction, undefined);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Créer un compte</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <Input name="email" type="email" placeholder="Email" required />
            <Input name="motDePasse" type="password" placeholder="Mot de passe (8 caractères min.)" required minLength={8} />
            <Input name="confirmationMotDePasse" type="password" placeholder="Confirmer le mot de passe" required minLength={8} />
            {state?.erreur && <p className="text-sm text-destructive">{state.erreur}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Création…" : "Créer mon compte"}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            Déjà un compte ? <Link href="/login" className="underline">Se connecter</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
