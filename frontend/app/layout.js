import "./globals.css";

export const metadata = {
  title: "VentureDive HR Assistant",
  description: "Internal RAG chatbot for job description Q&A",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
