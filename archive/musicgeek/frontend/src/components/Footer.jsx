export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-section footer-brand">
            <h3>🎸 MusicGeek</h3>
            <p>Master music with interactive lessons and practice tracking.</p>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} MusicGeek by FussyMonkey.dev</p>
        </div>
      </div>
    </footer>
  );
}
