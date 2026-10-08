import './globals.css';

export const metadata = {
  title: 'POS - দোকানের হিসাব',
  description: 'সহজ POS ও দোকান ম্যানেজমেন্ট সিস্টেম',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f2e2c',
};

export default function RootLayout({ children }) {
  return (
    <html lang="bn">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anek+Bangla:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
