#!/bin/bash
### NOTE: mac下用使用./oss.sh 而不能是 sh ./oss.sh, 否则会有signature不匹配

# ==================== Config ====================

accessKeyId='LTAIQGvJcHdwXeeZ'
accessKeySecret=$ALI_OSS_SECRET
endpoint='oss-cn-beijing.aliyuncs.com'
bucket="focus-resource"
cloudFolder="universal/crimson-sdk-prebuild/node"

# echo $accessKeySecret

# ================================================

declare -a result=()
encodeFilename=""

function uploadFile(){
  # timestamp=$(date +%s)
  # urlEncode "$timestamp-$(basename "$1")"
  urlEncode "$(basename "$1")"
  cloudDir="$cloudFolder/$encodeFilename"

  contentType=$(file -b --mime-type "$1")
  dateValue="$(TZ=GMT env LANG=en_US.UTF-8 date +'%a, %d %b %Y %H:%M:%S GMT')"
  stringToSign="PUT\n\n$contentType\n$dateValue\n/$bucket/$cloudFolder/$encodeFilename"
  signature=$(echo -en "$stringToSign" | openssl sha1 -hmac "$accessKeySecret" -binary | base64)
  echo "uploadFile, $1 => $cloudDir"

  curl -i -q -X PUT -T "$1" \
      -H "Content-Type: $contentType" \
      -H "Host: $bucket.$endpoint" \
      -H "Date: $dateValue" \
      -H "Authorization: OSS $accessKeyId:$signature" \
      https://"$bucket"."$endpoint"/"$cloudDir"

  result+=(https://"$bucket"."$endpoint"/"$cloudDir")
}

function urlEncode() {
  encodeFilename=""
  local length="${#1}"
  for (( i = 0; i < length; i++ ))
  do
    local c="${1:i:1}"
    case $c in 
      [a-zA-Z0-9.~_-]) 
        # shellcheck disable=SC2059
        encodeFilename=$encodeFilename$(printf "$c")
        ;;
      *) 
        encodeFilename=$encodeFilename$(printf "$c" | xxd -p -c1 | 
        while read x
        do 
          printf "%%%s" "$x"
        done)
    esac
  done
}

file_name=""

for os in "$@"; do
  if [ $os == 'mac' ]; then
    file_name="release/darwin/cmsn-electron-1.0.0.dmg"
  elif [ $os == 'win' ]; then
    file_name="release/win32/cmsn-electron-setup-1.0.0-x64.exe"
  fi

  if [ -n "$file_name" ]; then
    uploadFile $file_name
  fi
done

for res in "${result[@]}"; do
  echo "$res"
done