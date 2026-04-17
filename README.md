# Clashing with whitelists
##### Если вам просто нужен способ обхода белых списков – гайд находится в [vulpeace/roscomcircum](https://github.com/vulpeace/roscomcircum)
</br>

Скрипт на node для Github Actions, конвертирующий набор URI для vless в конфиг-файл для Mihomo (Clash).
По умолчанию список берется из репозитория [zieng2/wl](https://github.com/zieng2/wl), но вы можете предоставить другой, указав URL в переменной VLESS_URI_LIST_URL (не забудьте переименовать .env.example в .env).

Автор репозитория помечает ru сервера эмодзи соответствующего флага, только они попадают в конфиг.
Фильтрация происходит по HTML-коду этого эмодзи, вы можете использовать свое regexp в переменной SERVER_PATTERN без ограничивающих "/".

Кроме этого, скрипт стягивает ruleset (набор правил) с доменами, входящими в белые списки, в формате JSON из репозитория [jinndi/geosite-cheburnet](https://github.com/jinndi/geosite-cheburnet) (можно переопределить в переменной JSON_GEOSITE_URL) и конвертирует его в используемый Clash формат YAML.

URL этого рулсета как последний релиз на вашем репозитории сразу подставляется в конфиг. Если вы запускаете данный скрипт не в Actions, укажите URL в YAML_GEOSITE_URL.

Оба файла с именами clash-whitelist.yaml и geosite-cheburnet.yaml соответственно загружаются в новый релиз каждый час (период обновления репозитория zieng2/wl). 
