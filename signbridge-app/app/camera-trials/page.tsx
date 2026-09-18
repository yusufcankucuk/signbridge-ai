import { notFound } from "next/navigation";
import { CameraTrials } from "@/src/components/signbridge/CameraTrialsFlow";

// Kamera kabul denemeleri ekip aracıdır; yalnız CAMERA_TRIALS_ENABLED=true iken açılır.
export const dynamic = "force-dynamic";

export default function CameraTrialsPage() {
    if (process.env.CAMERA_TRIALS_ENABLED !== "true") notFound();
    return <CameraTrials />;
}
