import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata:Metadata={title:"MediKiosk | Digital Clinical Intake",description:"Independent health-tech pre-consultation system",robots:{index:false,follow:false}};
export const viewport:Viewport={width:"device-width",initialScale:1,themeColor:"#0b5d4b"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
