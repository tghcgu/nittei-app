import type { MetadataRoute } from "next";
import { siteDescription, siteName, siteUrl } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteName,
    short_name: siteName,
    description: siteDescription,
    start_url: siteUrl,
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: "/icon.png",
        sizes: "480x480",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
