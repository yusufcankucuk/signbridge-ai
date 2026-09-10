/** @type {import('next').NextConfig} */
const nextConfig = {
    // Separate validation output from a developer's running preview.
    distDir: process.env.SIGNBRIDGE_BUILD_DIR || '.next',
};

module.exports = nextConfig;
