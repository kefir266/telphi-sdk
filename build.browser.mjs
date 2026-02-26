#!/usr/bin/env node
/**
 * Build script for the self-contained browser bundle.
 *
 * Produces:
 *   dist/webrtc-sdk.iife.js          — readable, unminified
 *   dist/webrtc-sdk.iife.min.js      — minified for production
 *
 * The output is a standalone IIFE that requires NO external dependencies.
 * React, ReactDOM, MUI, Emotion, Zustand and all other deps are bundled in.
 *
 * Usage:
 *   node build.browser.mjs
 *   node build.browser.mjs --minify-only   (skip unminified build, e.g. CI)
 */

import { mkdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

import * as esbuild from 'esbuild'

const args = process.argv.slice(2)
const minifyOnly = args.includes('--minify-only')
const watchMode = args.includes('--watch')

const ENTRY = './src/browser.tsx'
const OUT_DIR = './dist'

// Guarantee output directory exists
mkdirSync(OUT_DIR, { recursive: true })

/** Shared esbuild configuration */
const sharedConfig = {
    entryPoints: [ENTRY],
    bundle: true,
    platform: 'browser',
    target: ['es2020', 'chrome96', 'firefox95', 'safari15'],
    format: 'iife',
    // No globalName — window.DelphiWebRTC is set explicitly inside browser.tsx.
    // Using globalName would cause esbuild to overwrite window.DelphiWebRTC with the
    // module namespace object { DelphiWebRTC: {...} } after the IIFE runs, wrapping
    // the API one level too deep.
    // Bundle everything — no external dependencies required from the host page
    external: [],
    // JSX: use the automatic React 18+ transform (no need to `import React`)
    jsx: 'automatic',
    jsxImportSource: 'react',
    // Loader for font/image assets that MUI might reference
    loader: {
        '.woff': 'dataurl',
        '.woff2': 'dataurl',
        '.ttf': 'dataurl',
        '.eot': 'dataurl',
        '.svg': 'dataurl',
        '.png': 'dataurl',
    },
    // Define process.env.NODE_ENV so MUI/React use production paths
    define: {
        'process.env.NODE_ENV': '"production"',
        'process.env': '{}',
    },
    // Silence 'use client' directives (they're Next.js-only — no-op in browser bundle)
    banner: {
        js: '/* @delphi/webrtc-sdk browser bundle — https://github.com/kombinat/itk-ai-assistant */',
    },
    plugins: [
        {
            // Strip 'use client' / 'use server' directives that esbuild doesn't understand
            name: 'strip-directives',
            setup(build) {
                build.onLoad({ filter: /\.(tsx?|jsx?)$/ }, async (args) => {
                    const fs = await import('fs/promises')
                    let contents = await fs.readFile(args.path, 'utf8')
                    // Remove top-level "use client" / "use server" directives
                    contents = contents.replace(/^['"]use (client|server)['"]\s*;?\s*/m, '')
                    return {
                        contents,
                        loader: args.path.endsWith('x') ? 'tsx' : 'ts',
                    }
                })
            },
        },
    ],
}

async function build(minify, outfile) {
    const label = minify ? 'minified' : 'readable'
    console.log(`\nBuilding ${label} bundle → ${outfile}`)

    const result = await esbuild.build({
        ...sharedConfig,
        outfile,
        minify,
        sourcemap: !minify, // source map only for the readable build
        metafile: true,
    })

    if (result.errors.length > 0) {
        console.error('Build errors:')
        result.errors.forEach((e) => console.error(e.text))
        process.exit(1)
    }

    // Print size summary
    const stat = statSync(outfile)
    const kb = (stat.size / 1024).toFixed(1)
    console.log(`  ✓ ${outfile}  (${kb} KB)`)

    // Write metafile for bundle analysis (readable build only)
    if (!minify) {
        const metaPath = join(OUT_DIR, 'meta.json')
        writeFileSync(metaPath, JSON.stringify(result.metafile, null, 2))
        console.log(
            `  ✓ ${metaPath}  (bundle analysis — open in https://esbuild.github.io/analyze/)`,
        )
    }
}

async function watch(minify, outfile) {
    const label = minify ? 'minified' : 'readable'
    console.log(`\nWatching ${label} bundle → ${outfile}`)

    const ctx = await esbuild.context({
        ...sharedConfig,
        outfile,
        minify,
        sourcemap: !minify,
    })

    await ctx.watch()
    console.log(`  ↺ watching for changes…`)
    return ctx
}

async function main() {
    console.log('Building @delphi/webrtc-sdk browser bundle...')

    if (watchMode) {
        const contexts = []
        if (!minifyOnly) {
            contexts.push(await watch(false, join(OUT_DIR, 'webrtc-sdk.iife.js')))
        }
        contexts.push(await watch(true, join(OUT_DIR, 'webrtc-sdk.iife.min.js')))

        console.log('\nWatch mode active. Press Ctrl+C to stop.')
        // Keep the process alive until interrupted
        process.on('SIGINT', async () => {
            await Promise.all(contexts.map((ctx) => ctx.dispose()))
            process.exit(0)
        })
        return
    }

    if (!minifyOnly) {
        await build(false, join(OUT_DIR, 'webrtc-sdk.iife.js'))
    }

    await build(true, join(OUT_DIR, 'webrtc-sdk.iife.min.js'))

    console.log('\nDone.')
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
