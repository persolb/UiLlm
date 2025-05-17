import sys
import json


def process(message):
    if 'tree' in message:
        return {
            'selectors': [
                {'name': 'Article', 'css': 'article', 'maxItems': 30},
                {'name': 'Links', 'css': 'a', 'maxItems': 20}
            ],
            'groups': {'Page': ['Article', 'Links']}
        }
    elif 'summary' in message:
        # naive check: accept as is
        return {'groups': {'Page': ['Article', 'Links']}}
    return {}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue
        resp = process(msg)
        sys.stdout.write(json.dumps(resp) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
