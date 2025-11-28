import React from "react";

export const Layout = ({
  children,
  title = "Subroutine",
}: {
  children: React.ReactNode;
  title?: string;
}) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="bg-gray-50 min-h-screen text-gray-900 font-sans antialiased">
        <div id="root">{children}</div>
      </body>
    </html>
  );
};
