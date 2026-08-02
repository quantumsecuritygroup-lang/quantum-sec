import Link from "next/link";
import Image from "next/image";
import { MembersSection } from "./members-section";

export function SideRailLeft() {
  return (
    <aside className="hidden w-full space-y-4 lg:block">
      <div className="border border-glow/30 bg-panel p-4">
        <div className="flex flex-col items-center gap-2">
          <Image
            src="/logo.png"
            alt="QSG logo"
            width={140}
            height={140}
            className="h-auto w-5/6 shrink-0 object-contain"
          />
          <p className="font-mono text-xs text-glow">(quantum㉿qsg)</p>
        </div>
        <p className="mt-2 text-center font-mono text-[11px] leading-5 text-muted">
          Secure community archive for the Quantum Security Group. Posts,
          lobby discussion, and dumps — hosted where it can&apos;t be taken
          down.
        </p>
      </div>

      <MembersSection variant="rail" />

      <div className="border border-edge bg-card p-4">
        <p className="mb-2 font-mono text-xs text-glow">$ about</p>
        <p className="font-mono text-[11px] leading-5 text-muted">
          Looking to contribute?{" "}
          <Link href="/sign-up" className="text-glow underline">
            Join the forum
          </Link>
          .
        </p>
      </div>
    </aside>
  );
}
