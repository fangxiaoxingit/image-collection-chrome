#!/usr/bin/env python3
"""Build the installable extension without repository or local user files."""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import zipfile


RUNTIME_FILES = (
    'manifest.json', 'background.js', 'assets/logo.png',
    'pages/list.html', 'pages/list.css', 'pages/list.js',
    'pages/parse.html', 'pages/parse.css', 'pages/parse.js',
    'pages/popup.html', 'pages/popup.css', 'pages/popup.js',
    'utils/storage.js', 'utils/download.js', 'utils/hash.js',
)


def validate_inputs(root, output, release_tag):
    extension = root / 'extension'
    if extension.is_symlink() or not extension.is_dir():
        raise ValueError('extension must be a regular directory, not a symlink')
    if output == extension.resolve() or extension.resolve() in output.parents:
        raise ValueError('output directory must be outside extension')

    expected = set(RUNTIME_FILES)
    directories = {str(Path(name).parent) for name in expected} - {'.'}
    found = set()
    for path in sorted(extension.rglob('*')):
        name = path.relative_to(extension).as_posix()
        if path.is_symlink():
            raise ValueError(f'symlinks are not allowed: {name}')
        if path.is_dir() and name in directories:
            continue
        if path.is_file() and path.name == '.DS_Store':
            continue
        if not path.is_file() or name not in expected:
            raise ValueError(f'unexpected extension entry: {name}')
        found.add(name)
    if found != expected:
        raise ValueError('missing runtime files: ' + ', '.join(sorted(expected - found)))

    license_path = root / 'LICENSE'
    if license_path.is_symlink() or not license_path.is_file():
        raise ValueError('LICENSE must be a regular file, not a symlink')
    if not license_path.read_bytes().strip():
        raise ValueError('LICENSE must not be empty')

    manifest = json.loads((extension / 'manifest.json').read_text(encoding='utf-8'))
    if not isinstance(manifest, dict) or manifest.get('manifest_version') != 3:
        raise ValueError('manifest_version must be 3')
    version = manifest.get('version')
    if (not isinstance(version, str)
            or not re.fullmatch(r'(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){0,3}', version)
            or any(int(part) > 65535 for part in version.split('.'))
            or not any(int(part) for part in version.split('.'))):
        raise ValueError('manifest.version must be a valid Chrome extension version')
    if release_tag is not None and release_tag != f'v{version}':
        raise ValueError('RELEASE_TAG must match v{manifest.version} exactly')

    background = manifest.get('background', {})
    action = manifest.get('action', {})
    if not isinstance(background, dict) or not isinstance(action, dict):
        raise ValueError('background and action must be manifest objects')
    if background.get('type') != 'module':
        raise ValueError('background.type must be module')
    resources = [background.get('service_worker'), action.get('default_popup')]
    for icons in (manifest.get('icons', {}), action.get('default_icon', {})):
        if isinstance(icons, str):
            resources.append(icons)
        elif isinstance(icons, dict):
            resources.extend(icons.values())
        else:
            raise ValueError('icon references must be paths or manifest objects')
    if any(not isinstance(resource, str) or resource not in expected
           for resource in resources):
        raise ValueError('manifest resource references must exist in the runtime allowlist')
    return version


def build_package(root, output=None, release_tag=None):
    root = Path(root).resolve()
    output = Path(output).resolve() if output is not None else root / 'dist'
    version = validate_inputs(root, output, release_tag)
    extension = root / 'extension'
    files = {name: (extension / name).read_bytes() for name in RUNTIME_FILES}
    files['LICENSE'] = (root / 'LICENSE').read_bytes()

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED,
                         compresslevel=9) as archive:
        for name in sorted(files):
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, files[name], compresslevel=9)

    data = buffer.getvalue()
    output.mkdir(parents=True, exist_ok=True)
    names = (f'image-collector-{version}.zip', 'image-collector.zip')
    for name in names:
        (output / name).write_bytes(data)
    digest = hashlib.sha256(data).hexdigest()
    (output / 'SHA256SUMS.txt').write_text(
        ''.join(f'{digest}  {name}\n' for name in names), encoding='utf-8')
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='output directory (default: dist)')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    try:
        output = build_package(root, args.output, os.environ.get('RELEASE_TAG'))
    except (OSError, ValueError, KeyError) as error:
        print(f'Package failed: {error}', file=sys.stderr)
        return 1
    print(f'Built extension archives and checksums in {output}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
