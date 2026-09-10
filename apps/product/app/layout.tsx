import type {Metadata} from "next";
import "./globals.css";

export const metadata:Metadata={
  title:"AtlasOS — Business observatory",
  description:"A live operating observatory for the business, powered by canonical business state and governed AI execution."
};

export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
