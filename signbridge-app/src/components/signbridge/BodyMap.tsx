"use client";

import { cn } from "../../../lib/utils";
import { BODY_REGIONS, type BodyRegion } from "../../data/regions";

interface BodyMapProps {
    selectedId?: string;
    onSelect: (region: BodyRegion) => void;
    className?: string;
}

/**
 * Dokunulabilir vücut haritası. Hasta ağrının yerini göstermek için doğrudan
 * şekle dokunur.
 *
 * Erişilebilirlik: haritanın kendisi fare/dokunma içindir ve `aria-hidden`
 * değildir — her bölge `role="button"`, `aria-label` ve `aria-pressed` taşır,
 * `tabIndex` ile klavyeden gezilir, Enter/Boşluk ile seçilir. Ayrıca ekranda
 * bölgelerin metin düğmeleri de var; haritayı hiç kullanmadan da seçim yapılır.
 */
export default function BodyMap({
    selectedId,
    onSelect,
    className,
}: BodyMapProps) {
    return (
        <svg
            viewBox="0 0 100 210"
            className={cn("h-full w-full", className)}
            role="group"
            aria-label="Vücut haritası — ağrıyan bölgeye dokunun"
        >
            {/* Boyun ve gövde birleşimi — dekoratif, seçilemez */}
            <rect
                x="45"
                y="29"
                width="10"
                height="8"
                rx="3"
                className="fill-brand-100"
            />

            {BODY_REGIONS.filter((region) => region.shapes.length > 0).map(
                (region) => {
                    const selected = region.id === selectedId;

                    return (
                        <g
                            key={region.id}
                            role="button"
                            tabIndex={0}
                            aria-label={region.label}
                            aria-pressed={selected}
                            onClick={() => onSelect(region)}
                            onKeyDown={(event) => {
                                if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                ) {
                                    event.preventDefault();
                                    onSelect(region);
                                }
                            }}
                            className={cn(
                                "cursor-pointer transition-colors duration-200",
                                selected
                                    ? "fill-brand-500 stroke-brand-700"
                                    : "fill-brand-100 stroke-brand-300 hover:fill-brand-200"
                            )}
                            strokeWidth="1.6"
                        >
                            {region.shapes.map((shape, index) =>
                                shape.kind === "ellipse" ? (
                                    <ellipse
                                        key={index}
                                        cx={shape.values[0]}
                                        cy={shape.values[1]}
                                        rx={shape.values[2]}
                                        ry={shape.values[3]}
                                    />
                                ) : (
                                    <rect
                                        key={index}
                                        x={shape.values[0]}
                                        y={shape.values[1]}
                                        width={shape.values[2]}
                                        height={shape.values[3]}
                                        rx={shape.values[4]}
                                    />
                                )
                            )}
                        </g>
                    );
                }
            )}
        </svg>
    );
}
