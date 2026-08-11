"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Logo } from "@/components/logo";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-[#f5f5f7] px-6 py-12">
      <div className="flex w-full max-w-sm flex-col">
        <Card className="w-full">
          <CardHeader className="gap-5 pb-2 text-center">
            <Link href="/" className="flex justify-center">
              <Logo />
            </Link>
            <h1 className="text-[28px] font-semibold tracking-tight">Connexion</h1>
            <p className="text-[17px] text-muted-foreground">
              Accédez à vos projets et estimations
            </p>
          </CardHeader>
          <CardContent className="pt-2">
            <form action={formAction} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="vous@exemple.com"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="motDePasse">Mot de passe</Label>
                <Input
                  id="motDePasse"
                  name="motDePasse"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
              </div>
              {state?.erreur && (
                <p role="alert" className="text-sm text-destructive">
                  {state.erreur}
                </p>
              )}
              <Button type="submit" disabled={pending} className="mt-2">
                {pending ? "Connexion…" : "Se connecter"}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Pas de compte ?{" "}
              <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
                Créer un compte
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
