import Image from "next/image";

import { cn } from "../../../lib/utils";
import ExpressionGlyph from "./ExpressionGlyph";
import type { Expression } from "../../data/expressions";

interface ExpressionVisualProps {
    expression: Expression;
    className?: string;
}

/**
 * Bir şikayetin büyük görseli. Resimli anlatımı varsa onu, yoksa çizgi glifini
 * gösterir — böylece resimler tek tek eklenirken ekranlar boş kalmaz.
 *
 * Erişilebilirlik: görsel dekoratiftir (`alt=""`); şikayetin adı ve cümlesi
 * ekranda metin olarak zaten yazıyor.
 */
export default function ExpressionVisual({
    expression,
    className,
}: ExpressionVisualProps) {
    if (expression.illustration && expression.illustrationTile) {
        const { column, row } = expression.illustrationTile;
        return <span className={cn("flex h-full w-full items-center justify-center", className)} aria-hidden="true">
            <span className="expression-sheet-tile" style={{
                backgroundImage: `url("${expression.illustration}")`,
                backgroundPosition: `${column * 25}% ${row * 100}%`,
            }} />
        </span>;
    }
    if (expression.illustration) {
        return (
            <Image
                src={expression.illustration}
                alt=""
                width={512}
                height={512}
                priority
                className={cn("h-full w-full object-contain", className)}
            />
        );
    }

    return (
        <ExpressionGlyph
            expression={expression}
            strokeWidth={2.2}
            className={cn("h-full w-full", className)}
        />
    );
}
