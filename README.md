# Clashing with whitelists
##### Если вам просто нужен способ обхода белых списков – гайд находится в [vulpeace/roscomcircum](https://github.com/vulpeace/roscomcircum)
</br>

Скрипт на node для Github Actions, конвертирующий подписку для VLESS в конфиг-файл для Mihomo (Clash).
URL на подписку указывается в переменной VLESS_SUB_URL, для релизов используется репозиторий [zieng2/wl](https://github.com/zieng2/wl).

Вы можете указать regexp без ограничивающих "/" в переменной SERVER_PATTERN  для фильтрации конвертируемых серверов.

Кроме этого, скрипт стягивает ruleset (набор правил) с доменами, входящими в белые списки, в формате JSON из репозитория [jinndi/geosite-cheburnet](https://github.com/jinndi/geosite-cheburnet) (указывается в переменной JSON_GEOSITE_URL) и конвертирует его в используемый Clash формат YAML.

URL этого рулсета как последний релиз в вашем репозитории сразу подставляется в конфиг. Если вы запускаете данный скрипт не в Actions, укажите URL в YAML_GEOSITE_URL.

Файлы с именами clash-whitelist.yaml, geosite-cheburnet.yaml и sing-whitelist.json загружаются в новый релиз каждый час (период обновления репозитория zieng2/wl).
