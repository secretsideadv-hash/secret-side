import Link from "next/link";
import { buttonClass } from "../ui/primitives";

/** Shown when the session cookie is missing or belongs to another session. */
export function NotOnThisPhone() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col justify-center gap-4 px-5">
      <h1 className="text-3xl font-bold">This adventure isn&apos;t on this phone</h1>
      <p className="text-muted">
        Adventures are saved on the phone that started them. Start it again from the adventure page to play here.
      </p>
      <Link href="/" className={buttonClass.secondary}>
        Back to Discover
      </Link>
    </main>
  );
}
