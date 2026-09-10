/**
 * SignBridge AI - API Gateway Fallback Rules
 */

exports.handler = async (event, context) => {
    // İstek gövdesi ham medya veya sağlık metni içerebilir; yalnız güvenli teknik alanlar loglanır.
    console.info("SignBridge fallback rule invoked", {
        requestId: context?.requestId ?? "unknown",
        method: event?.httpMethod ?? "unknown"
    });
    return {
        statusCode: 503,
        body: JSON.stringify({
            error: "Service temporarily unavailable. Please try again later."
        })
    };
};
