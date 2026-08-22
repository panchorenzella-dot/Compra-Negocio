import type { MetadataRoute } from "next";

const siteUrl = "https://www.compranegocio.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/negocios`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/comprar`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/vender`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/como-funciona`, changeFrequency: "monthly", priority: 0.7 },
  ];
}

