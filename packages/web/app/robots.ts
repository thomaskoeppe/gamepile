import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                disallow: [
                    "/api/",
                    "/admin/",
                    "/dashboard/",
                    "/_next/",
                    "/private/",
                ],
            },
        ],
        sitemap: `${process.env.WEB_APP_URL}/sitemap.xml`,
    };
}