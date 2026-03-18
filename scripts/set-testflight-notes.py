#!/usr/bin/env python3
"""Set TestFlight 'What to Test' notes via App Store Connect API."""

import jwt, time, json, urllib.request, sys, os

KEY_ID = os.environ.get('ASC_KEY_ID', '73PNP8Z93X')
ISSUER_ID = os.environ.get('ASC_ISSUER_ID', '0cf39ed9-c1a9-43b7-8d10-e8bcdae31bdf')
KEY_PATH = os.environ.get('ASC_KEY_PATH', os.path.expanduser('~/.appstoreconnect/AuthKey_73PNP8Z93X.p8'))
BUNDLE_ID = 'com.xavier.soarxvoice'

def main():
    if len(sys.argv) < 3:
        print(f'Usage: {sys.argv[0]} <build_number> <notes>')
        sys.exit(1)

    build_number = sys.argv[1]
    notes = sys.argv[2]

    with open(KEY_PATH, 'r') as f:
        key = f.read()

    now = int(time.time())
    token = jwt.encode(
        {'iss': ISSUER_ID, 'iat': now, 'exp': now + 1200, 'aud': 'appstoreconnect-v1'},
        key, algorithm='ES256', headers={'kid': KEY_ID}
    )

    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

    # Find app
    req = urllib.request.Request(
        f'https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]={BUNDLE_ID}', headers=headers)
    resp = json.loads(urllib.request.urlopen(req).read())
    app_id = resp['data'][0]['id']

    # Find build (retry up to 5 times)
    build_id = None
    for attempt in range(1, 6):
        req = urllib.request.Request(
            f'https://api.appstoreconnect.apple.com/v1/builds?filter[app]={app_id}&filter[version]={build_number}&sort=-uploadedDate&limit=1',
            headers=headers)
        resp = json.loads(urllib.request.urlopen(req).read())
        if resp['data']:
            build_id = resp['data'][0]['id']
            break
        print(f'Build not yet available, waiting 30s... (attempt {attempt}/5)')
        time.sleep(30)

    if not build_id:
        print(f'ERROR: Could not find build {build_number}')
        sys.exit(1)

    # Get existing localizations
    req = urllib.request.Request(
        f'https://api.appstoreconnect.apple.com/v1/builds/{build_id}/betaBuildLocalizations', headers=headers)
    resp = json.loads(urllib.request.urlopen(req).read())

    if resp['data']:
        loc_id = resp['data'][0]['id']
        body = json.dumps({'data': {'type': 'betaBuildLocalizations', 'id': loc_id,
                                     'attributes': {'whatsNew': notes}}}).encode()
        req = urllib.request.Request(
            f'https://api.appstoreconnect.apple.com/v1/betaBuildLocalizations/{loc_id}',
            data=body, headers=headers, method='PATCH')
    else:
        body = json.dumps({'data': {'type': 'betaBuildLocalizations',
                                     'attributes': {'locale': 'en-US', 'whatsNew': notes},
                                     'relationships': {'build': {'data': {'type': 'builds', 'id': build_id}}}}}).encode()
        req = urllib.request.Request(
            'https://api.appstoreconnect.apple.com/v1/betaBuildLocalizations',
            data=body, headers=headers, method='POST')

    urllib.request.urlopen(req)
    print('TestFlight notes set successfully!')

if __name__ == '__main__':
    main()
