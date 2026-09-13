import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "SignBridge",
        short_name: "SignBridge",
        description: "Sağlıkta engelsiz iletişim",
        start_url: "/",
        display: "standalone",
        background_color: "#f8fbfa",
        theme_color: "#087c83",
        lang: "tr",
        icons: [
            {
                src: "/logo/signbridge-logo.png",
                sizes: "488x488",
                type: "image/png",
                purpose: "any",
            },
        ],
    };
}
