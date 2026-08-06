export function AdminPresentationShell({
  testId,
  contextOpen,
  mobile,
  iconRail,
  contextRail,
  contextScrim,
  header,
  contentRef,
  children,
  statusbar,
}) {
  const shellIdentity = testId === "integrated-admin-shell"
    ? { "data-testid": "integrated-admin-shell" }
    : { "data-testid": "admin-shell" };

  return (
    <div
      className={`admin-shell ${contextOpen ? "context-open" : "context-closed"}`}
      {...shellIdentity}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          contentRef?.current?.focus();
        }}
      >
        Ana içeriğe geç
      </a>
      {iconRail}
      {contextRail}
      {contextScrim}
      <div className="admin-main" inert={mobile && contextOpen ? true : undefined}>
        {header}
        <main className="content-area" id="main-content" ref={contentRef} tabIndex="-1">
          {children}
        </main>
        {statusbar}
      </div>
    </div>
  );
}
