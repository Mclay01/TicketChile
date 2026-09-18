export default function AuthShell({ children }: { children: React.ReactNode }) {
  return <div className="auth-layout"><aside className="auth-editorial"><p className="eyebrow">TicketChile · En primera persona</p><div className="stack"><h2>Lo mejor<br />es estar ahí.</h2><p className="muted">Tus entradas, tus planes y todo lo que viene.</p></div><div className="stack"><hr className="perforation" /><p className="eyebrow">Cultura · Música · Encuentros</p></div></aside><div className="auth-form stack">{children}</div></div>;
}
