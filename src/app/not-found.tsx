import Link from "next/link";

export default function NotFound() {
  return (
    <main className="signin">
      <div className="card">
        <h1>Not found</h1>
        <p className="sub">That page or record doesn&apos;t exist.</p>
        <Link href="/">Back to the overview</Link>
      </div>
    </main>
  );
}
