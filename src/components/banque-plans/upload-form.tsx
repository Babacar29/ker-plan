"use client";

import { useRef, useState, useTransition } from "react";
import { uploaderPlanAction } from "@/app/banque-plans/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function UploadForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setErreur(null);
    startTransition(async () => {
      try {
        await uploaderPlanAction(formData);
      } catch (error) {
        if (error instanceof Error && error.message !== "NEXT_REDIRECT") {
          setErreur(error.message);
        }
      }
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-border p-6"
    >
      <label className="text-[15px] font-medium text-foreground" htmlFor="image">
        Image du plan
      </label>
      <Input id="image" name="image" type="file" accept="image/*" required />

      <label className="text-[15px] font-medium text-foreground" htmlFor="source">
        Source (optionnel)
      </label>
      <Input id="source" name="source" type="text" placeholder="ex: Sene Archi" />

      {erreur && <p className="text-[14px] text-destructive">{erreur}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Envoi et analyse..." : "Uploader et analyser"}
      </Button>
    </form>
  );
}
