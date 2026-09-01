/**
 * SignBridge AI - API Gateway Fallback Rules
 */

exports.handler = async (event, context) => {
    console.log("Executing fallback rule for event:", event);
    return {
        statusCode: 503,
        body: JSON.stringify({
            error: "Service temporarily unavailable. Please try again later."
        })
    };
};
