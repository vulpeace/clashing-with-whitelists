import 'dotenv/config.js';
import yaml from 'yaml';
import { readFile, writeFile } from 'fs/promises';

async function getGeoYaml() {
    const url = URL.canParse(process.env.JSON_GEOSITE_URL) ? new URL(process.env.JSON_GEOSITE_URL)
        : 'https://github.com/jinndi/geosite-cheburnet/releases/latest/download/geosite-cheburnet.json';
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch geosite: ${res.statusText}`);
    }

    const geositeJson = await res.json();
    if (Object.keys(geositeJson) === 0) {
        throw new Error(`Geosite is empty`);
    }

    const geositeYaml = new yaml.Document(geositeJson);
    return yaml.stringify(geositeYaml, 2);
}

async function getWlArray() {
    const serverPattern = process.env.SERVER_PATTERN ? new RegExp(process.env.SERVER_PATTERN)
        : new RegExp("%F0%9F%87%B7%F0%9F%87%BA");
    const url = URL.canParse(process.env.VLESS_URI_LIST_URL) ? new URL(process.env.VLESS_URI_LIST_URL)
        : 'https://raw.githubusercontent.com/zieng2/wl/refs/heads/main/vless_lite.txt';
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

function getParsedUriArray(wlArray) {
    let parsedUriArray = [];
    wlArray.forEach(uri => {
        const parsedUri = {
            name: uri.match(/(?:#)(\S+)/),
            uuid: uri.match(/(?:\/\/)([^@]+)/),
            server: uri.match(/(?:@)([^:]+)/),
            port: uri.match(/(?::)([0-9]+)(?:\?)/),
            encryption: /(?:encryption=none)/.test(uri),
            type: uri.match(/(?:type=)(tcp|grpc|xhttp)/),
            security: uri.match(/(?:security=)(tls|reality)/),
            servername: uri.match(/(?:sni=)([^&#]+)/),
            flow: /(?:flow=xtls-rprx-vision)/.test(uri),
            reality: {
                publicKey: uri.match(/(?:pbk=)([^&#]+)/),
                shortId: uri.match(/(?:sid=)([^&#]+)/)
            },
            grpc: {
                mode: /(?:mode=gun)/.test(uri),
                serviceName: uri.match(/(?:serviceName=)([^&#]+)/),
            },
            xhttp: {
                path: uri.match(/(?:path=)([^&#]+)/),
                mode: uri.match(/(?:mode=)([^&#]+)/)
            },
            alpn: uri.match(/(?:alpn=)([^&#]+)/),
            fp: uri.match(/(?:fp=)([^&#]+)/)
        }

        const isNotPresent = item => !item;
        if (Object.values(parsedUri).slice(0, 8).some(isNotPresent)
            || parsedUri.type[1] === 'grpc' && !parsedUri.grpc.mode) {
            return;
        }

        parsedUriArray.push(parsedUri);
    });

    return parsedUriArray;
}

function compileClashConfig(parsedUriArray, templateClash) {
    let clashConfig = structuredClone(templateClash);

    parsedUriArray.forEach(parsedUri => {
        let outbound = {
            name: decodeURIComponent(parsedUri.name[1]),
            type: 'vless',
            uuid: parsedUri.uuid[1],
            server: parsedUri.server[1],
            port: parsedUri.port[1],
            encryption: 'none',
            'tls': true,
            servername: parsedUri.servername[1],
            'client-fingerprint': parsedUri.fp && parsedUri.fp[1] !== 'randomized'
                ? parsedUri.fp[1] : 'random',
            'skip-cert-verify': false,
            flow: parsedUri.flow ? 'xtls-rprx-vision' : '',
            alpn: parsedUri.alpn ? decodeURIComponent(parsedUri.alpn[1]).split(',')
                : ['h2', 'http/1.1'],
            udp: true,
            'packet-encoding': 'xudp',
            network: parsedUri.type[1]
        }

        if (parsedUri.security[1] === 'reality') {
            outbound['reality-opts'] = {
                'public-key': parsedUri.reality.publicKey[1],
                'short-id': parsedUri.reality.shortId ? parsedUri.reality.shortId[1] : ''
            };
        }

        if (parsedUri.type[1] === 'grpc') {
            outbound['grpc-opts'] = {
                'grpc-service-name': parsedUri.grpc.serviceName
                    ? parsedUri.grpc.serviceName[1] : 'GunService'
            }
        }

        if (parsedUri.type[1] === 'xhttp') {
            outbound['xhttp-opts'] = {
                path: parsedUri.xhttp.path ? parsedUri.xhttp.path[1] : '',
                mode: parsedUri.xhttp.mode ? parsedUri.xhttp.mode[1] : ''
            }
        }

        clashConfig.proxies.push(outbound);
        clashConfig['proxy-groups'][0].proxies.push(outbound.name);
    });

    const repoEnv = process.env.GITHUB_REPOSITORY;
    const yamlGeositeEnv = process.env.YAML_GEOSITE_URL;
    let geositeUrl = '';
    if (repoEnv) {
        geositeUrl = `https://github.com/${repoEnv}/releases/latest/download/geosite-cheburnet.yaml`;
    } else if (URL.canParse(yamlGeositeEnv)) {
        geositeUrl =  new URL(yamlGeositeEnv);
    } else {
        geositeUrl = 'https://github.com/vulpeace/clashing-with-whitelists/releases/latest/download/geosite-cheburnet.yaml';
    }

    clashConfig['rule-providers']['geosite-cheburnet'].url = geositeUrl;
 
    const clashConfigYaml = new yaml.Document(clashConfig);
    return yaml.stringify(clashConfigYaml, 2);
}

async function main() {
    let clashTemplate = null;
    try {
        clashTemplate = JSON.parse(await readFile('clash-template.json', 'utf8'));
    } catch(e) {
        console.error(e.message);
        process.exit(1);
    }

    const results = await Promise.allSettled([getGeoYaml(), getWlArray()]);
    const geoResult = results[0];
    const wlResult = results[1];

    if (geoResult.status === 'fulfilled') {
        const geosite = geoResult.value;
        try {
            await writeFile('geosite-cheburnet.yaml', geosite);
        } catch(e) {
            console.log(e.message);
        }
    } else {
        console.error(geoResult.reason.message);
    }

    if (wlResult.status === 'fulfilled') {
        const uriArray = wlResult.value;
        const parsedUriArray = getParsedUriArray(uriArray);
        try {
            const clashConfig = compileClashConfig(parsedUriArray, clashTemplate);
            await writeFile('clash-whitelist.yaml', clashConfig);
        } catch(e) {
            console.error(e.message);
        }
    } else {
        console.error(wlResult.reason.message);
    }
}

main();