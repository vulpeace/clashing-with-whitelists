import 'dotenv/config.js';
import yaml from 'yaml';
import { readFile, writeFile } from 'fs/promises';

async function getGeoYaml(url: string) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch geosite: ${res.statusText}`);
    }

    const geositeJson = await res.json();
    if (Object.keys(geositeJson).length === 0) {
        throw new Error('Geosite is empty');
    }

    const geositeYaml = new yaml.Document(geositeJson);
    return yaml.stringify(geositeYaml, undefined, 2);
}

async function getWlArray(url: string, serverPattern: RegExp) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch whitelist: ${res.statusText}`);
    }

    const wlText = await res.text()
    const wlTextArr = wlText.split('\n');
    if (wlTextArr.length === 0) {
        throw new Error(`No URIs found`);
    }
    const filteredWlTextArr = wlTextArr.filter(uri => uri.match(serverPattern));

    return filteredWlTextArr;
}

interface ParsedUri {
    name: string | undefined,
    uuid: string | undefined,
    server: string | undefined,
    port: string | undefined,
    encryption: boolean,
    type: string | undefined,
    security: string | undefined,
    servername: string | undefined,
    flow: string | undefined,
    reality: {
        publicKey: string | undefined,
        shortId: string | undefined
    },
    grpc: {
        mode: boolean,
        serviceName: string | undefined
    },
    xhttp: {
        path: string | undefined,
        mode: string | undefined
    },
    alpn: string | undefined,
    fp: string | undefined
}

function getParsedUriArray(wlArray: string[]) {
    let parsedUriArray: ParsedUri[] = [];
    wlArray.forEach(uri => {
        const parsedUri: ParsedUri = {
            name: uri.match(/(?:#)(\S+)/)?.[1],
            uuid: uri.match(/(?:\/\/)([^@]+)/)?.[1],
            server: uri.match(/(?:@)([^:]+)/)?.[1],
            port: uri.match(/(?::)([0-9]+)(?:\?)/)?.[1],
            encryption: /(encryption=none)/.test(uri),
            type: uri.match(/(?:type=)(tcp|grpc|xhttp)/)?.[1],
            security: uri.match(/(?:security=)(tls|reality)/)?.[1],
            servername: uri.match(/(?:sni=)([^&#]+)/)?.[1],
            flow: uri.match(/(?:flow=)(xtls-rprx-vision)/)?.[1],
            reality: {
                publicKey: uri.match(/(?:pbk=)([^&#]+)/)?.[1],
                shortId: uri.match(/(?:sid=)([^&#]+)/)?.[1]
            },
            grpc: {
                mode: /(?:mode=gun)/.test(uri),
                serviceName: uri.match(/(?:serviceName=)([^&#]+)/)?.[1],
            },
            xhttp: {
                path: uri.match(/(?:path=)([^&#]+)/)?.[1],
                mode: uri.match(/(?:mode=)([^&#]+)/)?.[1]
            },
            alpn: uri.match(/(?:alpn=)([^&#]+)/)?.[1],
            fp: uri.match(/(?:fp=)([^&#]+)/)?.[1]
        }

        const isNotPresent = (item: any) => !item;
        if (Object.values(parsedUri).slice(0, 8).some(isNotPresent)
            || parsedUri.type === 'grpc' && !parsedUri.grpc.mode) {
            return;
        }

        parsedUriArray.push(parsedUri);
    });

    return parsedUriArray;
}

function compileClashConfig(parsedUriArray: ParsedUri[], clashTemplate: any) {
    let clashConfig = structuredClone(clashTemplate);

    parsedUriArray.forEach(parsedUri => {
        let outbound = {
            name: decodeURIComponent(parsedUri.name),
            type: 'vless',
            uuid: parsedUri.uuid,
            server: parsedUri.server,
            port: parseInt(parsedUri.port),
            encryption: 'none',
            tls: true,
            servername: parsedUri.servername,
            'client-fingerprint': parsedUri.fp && parsedUri.fp !== 'randomized' ?
                parsedUri.fp : 'random',
            'skip-cert-verify': false,
            flow: parsedUri.flow,
            alpn: parsedUri.alpn ? decodeURIComponent(parsedUri.alpn).split(',')
                : ['h2', 'http/1.1'],
            udp: true,
            'packet-encoding': 'xudp',
            network: parsedUri.type,
            'reality-opts': parsedUri.security === 'reality' ?
            {
                'public-key': parsedUri.reality.publicKey,
                'short-id': parsedUri.reality.shortId
            } : {},
            'grpc-opts': parsedUri.type === 'grpc' ?
            {
                'grpc-service-name': parsedUri.grpc.serviceName ?
                    parsedUri.grpc.serviceName : 'GunService'
            } : {},
            'xhttp-opts': parsedUri.type === 'xhttp' ?
            {
                path: parsedUri.xhttp.path,
                mode: parsedUri.xhttp.mode
            } : {}
        }

        clashConfig.proxies.push(outbound);
        clashConfig['proxy-groups'][0].proxies.push(outbound.name);
    });

    const repoEnv = process.env.GITHUB_REPOSITORY;
    const yamlGeositeEnv = process.env.CLASH_GEOSITE_URL;
    let geositeUrl: string = '';
    if (repoEnv) {
        geositeUrl = `https://github.com/${repoEnv}/releases/latest/download/geosite-cheburnet.yaml`;
    } else if (yamlGeositeEnv && URL.canParse(yamlGeositeEnv)) {
        geositeUrl =  yamlGeositeEnv;
    } else {
        throw new Error('Clash geosite URL must be specified and valid');
    }

    clashConfig['rule-providers']['geosite-cheburnet'].url = geositeUrl;
 
    const clashConfigYaml = new yaml.Document(clashConfig);
    return yaml.stringify(clashConfigYaml, undefined, 2);
}

function compileSingConfig(parsedUriArray: ParsedUri[], singTemplate: any) {
    let singConfig = structuredClone(singTemplate);

    parsedUriArray.forEach(parsedUri => {
        let outbound = {
            tag: decodeURIComponent(parsedUri.name),
            type: 'vless',
            uuid: parsedUri.uuid,
            server: parsedUri.server,
            server_port: parseInt(parsedUri.port),
            tls: {
                enabled: true,
                server_name: parsedUri.servername,
                alpn: parsedUri.alpn ? decodeURIComponent(parsedUri.alpn).split(',')
                    : ['h2', 'http/1.1'],
                utls: {
                    enabled: true,
                    fingerprint: parsedUri.fp ? parsedUri.fp : 'random',
                },
                reality: parsedUri.security === 'reality' ? {
                    enabled: true,
                    public_key: parsedUri.reality.publicKey,
                    short_id: parsedUri.reality.shortId
                } : {}
            },
            flow: parsedUri.flow,
            transport: parsedUri.type === 'grpc' ?
            {
                type: "grpc",
                service_name: parsedUri.grpc.serviceName ?
                    parsedUri.grpc.serviceName : "GunService"
            } : {},
        }

        singConfig.outbounds.push(outbound);
        singConfig.outbounds[0].outbounds.push(outbound.tag);
    });
    singConfig.route.rule_set[1].url = process.env.JSON_GEOSITE_URL;

    return JSON.stringify(singConfig, undefined, 2);
}

async function main() {
    let clashTemplate: any, singTemplate: any = null;
    let isClashSkipped: boolean = false;
    try {
        clashTemplate = JSON.parse(await readFile('clash-template.json', 'utf8'));
    } catch(e: any) {
        console.error(e.message, '\nSkipping Clash template');
        isClashSkipped = true;
    }

    try {
        singTemplate = JSON.parse(await readFile('sing-template.json', 'utf8'));
    } catch(e: any) {
        console.error(e.message, '\nSkipping sing-box template');
        if (isClashSkipped) {
            console.error('No valid templates found');
            process.exit(1);
        }
    }

    const jsonGeositeUrl = process.env.JSON_GEOSITE_URL;
    const uriListUrl = process.env.VLESS_SUB_URL;
    if (!jsonGeositeUrl || !URL.canParse(jsonGeositeUrl)
        || !uriListUrl || !URL.canParse(uriListUrl)) {
        console.error('Both JSON geosite and VLESS subscription URLs must be specified in .env and valid');
        process.exit(1);
    }
    const serverPattern = process.env.SERVER_PATTERN ? new RegExp(process.env.SERVER_PATTERN)
        : new RegExp(".*");
    const results = await Promise.allSettled([getGeoYaml(jsonGeositeUrl),
        getWlArray(uriListUrl, serverPattern)]);
    const geoResult = results[0];
    const wlResult = results[1];

    if (geoResult.status === 'fulfilled') {
        const geosite = geoResult.value;
        try {
            await writeFile('geosite-cheburnet.yaml', geosite);
        } catch(e: any) {
            console.error(e.message);
        }
    } else {
        console.error(geoResult.reason.message);
    }

    if (wlResult.status === 'fulfilled') {
        const uriArray = wlResult.value;
        const parsedUriArray = getParsedUriArray(uriArray);
        try {
            const clashConfig = clashTemplate ?
                compileClashConfig(parsedUriArray, clashTemplate) : null;
            if (clashConfig) await writeFile('clash-whitelist.yaml', clashConfig);
            const singConfig = singTemplate ?
                compileSingConfig(parsedUriArray, singTemplate) : null;
            if (singConfig) await writeFile('sing-whitelist.json', singConfig);
        } catch(e: any) {
            console.error(e.message);
        }
    } else {
        console.error(wlResult.reason.message);
    }
}

main();