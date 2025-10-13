import "./globals.css";
import { Montserrat } from 'next/font/google'
export const metadata = {
    title: "Labeler MVP",
    description: "Next.js + Konva + OpenCV.js"
  };

  const geist = Montserrat({ subsets: ['latin']})
 
  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="en" className={geist.className}>
        <body style={{ margin: 0 }}>
          {children}
        </body>
      </html>
    );
  }
  