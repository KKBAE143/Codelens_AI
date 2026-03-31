import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://codelens.ai";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/explore", "/explore/*", "/pricing"],
        disallow: ["/api/", "/dashboard", "/course/", "/share/", "/generate"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
