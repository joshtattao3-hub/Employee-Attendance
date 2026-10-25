// A simple full-screen message: loading, errors, or setup problems.
function StatusScreen({ title, text, busy = false, children }) {
  return (
    <div className="status-screen">
      <div className="status-screen__card" role={busy ? "status" : "alert"}>
        {busy && <span className="spinner spinner--dark" aria-hidden="true" />}
        <h1 className="status-screen__title">{title}</h1>
        {text && <p className="status-screen__text">{text}</p>}
        {children}
      </div>
    </div>
  );
}

export default StatusScreen;