import { Cake } from "lucide-react";

export type Birthday = { id: string; name: string; initials: string; dateLabel: string; inDays: number; isYou: boolean };

const when = (n: number) => (n === 0 ? "Today" : n === 1 ? "Tomorrow" : `in ${n} days`);

/** The next few birthdays in the organization (day and month only), shown under the day timeline. */
export default function UpcomingBirthdays({ items }: { items: Birthday[] }) {
  return (
    <div style={{ borderTop: "1px solid var(--mp-border)", paddingTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Cake size={16} style={{ color: "var(--mp-primary-dark)" }} aria-hidden />
        <span className="label">Upcoming birthdays</span>
      </div>
      {items.length === 0 ? (
        <p className="sub" style={{ margin: 0 }}>No birthdays to show yet. They appear here as teammates add their date of birth.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {items.map((b) => (
            <div
              key={b.id}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 12px 8px 8px", borderRadius: 999, minWidth: 0,
                background: b.inDays === 0 ? "var(--mp-primary-muted)" : "var(--mp-muted)",
                border: b.inDays === 0 ? "1px solid var(--mp-primary)" : "1px solid transparent",
              }}
            >
              <span style={{ width: 32, height: 32, borderRadius: 999, flexShrink: 0, background: "#fff", color: "var(--mp-primary-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                {b.inDays === 0 ? "🎂" : b.initials}
              </span>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0, lineHeight: 1.25 }}>
                <span style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                  {b.isYou ? "You" : b.name}
                </span>
                <span style={{ fontSize: 12, color: "var(--mp-text2)" }}>
                  {b.dateLabel} · {when(b.inDays)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
