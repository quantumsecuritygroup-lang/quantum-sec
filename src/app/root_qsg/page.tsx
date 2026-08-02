import { redirect } from "next/navigation";
import Link from "next/link";
import { clerkConfigured } from "@/lib/config";
import { ensureProfile } from "@/lib/auth";
import { getAdminData, getSecurityData, type AdminFilters, type PostWithMeta } from "@/lib/data";
import { AdminUserRow } from "@/components/admin-user-row";
import { AdminCommentRow } from "@/components/admin-comment-row";
import { AdminPostRow } from "@/components/admin-post-row";
import { AdminFilterBar } from "@/components/admin-filter-bar";
import { SecurityMonitor } from "@/components/security-monitor";
import { SetupScreen } from "@/components/setup-screen";

export const dynamic = "force-dynamic";

function parseFilters(sp: URLSearchParams): AdminFilters {
  const status = sp.get("status");
  const page = Number(sp.get("page"));
  return {
    q: sp.get("q") ?? "",
    status:
      status === "visible" || status === "hidden" || status === "pinned"
        ? status
        : "all",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

function PostTable({
  title,
  accent,
  items,
  total,
  page,
  perPage,
  emptyLabel,
}: {
  title: string;
  accent: string;
  items: PostWithMeta[];
  total: number;
  page: number;
  perPage: number;
  emptyLabel: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-mono text-sm" style={{ color: accent }}>
          $ {title} <span className="text-faint">({total})</span>
        </h2>
      </div>
      <div className="overflow-x-auto border border-edge bg-card">
        <table className="w-full text-left">
          <thead className="border-b border-edge font-mono text-[10px] tracking-widest text-muted">
            <tr>
              <th className="py-2 px-2">POST</th>
              <th className="py-2 px-2">AUTHOR</th>
              <th className="py-2 px-2">STATUS</th>
              <th className="py-2 px-2 text-center">💬</th>
              <th className="py-2 px-2 text-center">REACT</th>
              <th className="py-2 px-2">AGE</th>
              <th className="py-2 px-2">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 px-2 font-mono text-xs text-faint">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <AdminPostRow key={item.post.id} item={item} />
              ))
            )}
          </tbody>
        </table>
      </div>
      {total > perPage && (
        <Pagination page={page} totalPages={totalPages} total={total} />
      )}
    </section>
  );
}

function Pagination({
  page,
  totalPages,
  total,
}: {
  page: number;
  totalPages: number;
  total: number;
}) {
  const href = (n: number) => {
    const sp = new URLSearchParams();
    if (n <= 1) sp.delete("page");
    else sp.set("page", String(n));
    const qs = sp.toString();
    return qs ? `/root_qsg?${qs}` : "/root_qsg";
  };
  return (
    <div className="mt-3 flex items-center justify-between font-mono text-xs text-muted">
      <span>
        page {page} / {totalPages} — {total} total
      </span>
      <div className="flex items-center gap-2">
        <Link
          href={href(page - 1)}
          className={`px-2 py-1 transition-colors ${
            page <= 1 ? "pointer-events-none text-faint" : "text-glow hover:opacity-70"
          }`}
        >
          ← PREV
        </Link>
        <Link
          href={href(page + 1)}
          className={`px-2 py-1 transition-colors ${
            page >= totalPages ? "pointer-events-none text-faint" : "text-glow hover:opacity-70"
          }`}
        >
          NEXT →
        </Link>
      </div>
    </div>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!clerkConfigured()) return <SetupScreen what="clerk" />;

  const profile = await ensureProfile();
  if (!profile) return <SetupScreen what="clerk" />;
  if (profile.role !== "admin") redirect("/");

  const resolved = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(resolved)) {
    if (typeof v === "string") sp.set(k, v);
  }
  const filters = parseFilters(sp);
  const data = await getAdminData(filters);
  const security = await getSecurityData();
  if (!data) return <SetupScreen what="database" />;

  const stats: { label: string; value: number; danger?: boolean }[] = [
    { label: "USERS", value: data.stats.users },
    { label: "POSTS", value: data.stats.posts },
    { label: "COMMENTS", value: data.stats.comments },
    { label: "REACTIONS", value: data.stats.reactions },
    { label: "FOLLOWS", value: data.stats.follows },
    { label: "SECURITY EVENTS", value: security?.events.length ?? 0, danger: true },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-sm text-amber">
          $ admin console{" "}
          <span className="text-faint">— root access granted</span>
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label} className="border border-edge bg-card p-4">
              <p
                className={`font-mono text-2xl font-bold ${
                  s.danger ? "text-danger" : "text-glow"
                }`}
              >
                {s.value}
              </p>
              <p className="mt-1 font-mono text-[10px] tracking-widest text-muted">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <section>
        <h2 className="mb-3 font-mono text-sm text-glow">$ members</h2>
        <div className="overflow-x-auto border border-edge bg-card">
          <table className="w-full text-left">
            <thead className="border-b border-edge font-mono text-[10px] tracking-widest text-muted">
              <tr>
                <th className="py-2 px-2">NAME</th>
                <th className="py-2 px-2">ROLE</th>
                <th className="py-2 px-2">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <AdminUserRow key={u.id} user={u} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border border-glow/30 bg-panel/50 p-3">
        <p className="font-mono text-xs text-glow">$ filter posts</p>
        <AdminFilterBar q={data.filters.q ?? ""} status={data.filters.status ?? "all"} />
      </div>

      <PostTable
        title="main feed posts"
        accent="#00d0ff"
        items={data.mainPosts}
        total={data.mainTotal}
        page={data.postPage}
        perPage={data.perPage}
        emptyLabel="No main feed posts."
      />

      <PostTable
        title="lobby posts"
        accent="#b18cff"
        items={data.lobbyPosts}
        total={data.lobbyTotal}
        page={data.postPage}
        perPage={data.perPage}
        emptyLabel="No lobby posts."
      />

      <section>
        <h2 className="mb-3 font-mono text-sm text-glow">
          $ comment moderation <span className="text-faint">(latest 50)</span>
        </h2>
        <div className="overflow-x-auto border border-edge bg-card">
          <table className="w-full text-left">
            <thead className="border-b border-edge font-mono text-[10px] tracking-widest text-muted">
              <tr>
                <th className="py-2 px-2">AUTHOR</th>
                <th className="py-2 px-2">CONTENT</th>
                <th className="py-2 px-2">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {data.comments.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 px-2 font-mono text-xs text-faint">
                    No comments.
                  </td>
                </tr>
              ) : (
                data.comments.map((c) => (
                  <AdminCommentRow key={c.id} comment={c} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-mono text-sm text-danger">
          $ security monitor{" "}
          <span className="text-faint">— attacker / suspicious activity</span>
        </h2>
        {security ? (
          <SecurityMonitor events={security.events} blockedIps={security.blockedIps} />
        ) : (
          <p className="font-mono text-xs text-faint">Security log unavailable.</p>
        )}
      </section>
    </div>
  );
}
