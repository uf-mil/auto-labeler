export const metadata = {
    title: "Labeler MVP",
    description: "Next.js + Konva + OpenCV.js"
  };
  
  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="en">
        <body style={{ margin: 0, fontFamily: "Inter, system-ui, Arial" }}>
          {children}
        </body>
      </html>
    );
  }
  