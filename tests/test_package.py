import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'package.py'
RUNTIME_FILES = (
    'manifest.json', 'background.js', 'assets/logo.png',
    'pages/list.html', 'pages/list.css', 'pages/list.js',
    'pages/parse.html', 'pages/parse.css', 'pages/parse.js',
    'pages/popup.html', 'pages/popup.css', 'pages/popup.js',
    'utils/storage.js', 'utils/download.js', 'utils/hash.js',
)


class PackageTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / 'repo'
        self.root.mkdir()
        self.extension = self.root / 'extension'
        for name in RUNTIME_FILES:
            path = self.extension / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(('runtime:' + name).encode())
        self.manifest = {
            'manifest_version': 3,
            'name': 'Image Collector',
            'version': '1.0.0',
            'background': {'service_worker': 'background.js', 'type': 'module'},
            'icons': {'128': 'assets/logo.png'},
            'action': {'default_popup': 'pages/popup.html',
                       'default_icon': {'16': 'assets/logo.png'}},
        }
        self.write_manifest()
        (self.root / 'LICENSE').write_text('MIT test license\n')
        (self.root / 'scripts').mkdir()
        if SCRIPT.exists():
            shutil.copyfile(SCRIPT, self.root / 'scripts' / 'package.py')

    def write_manifest(self):
        (self.extension / 'manifest.json').write_text(json.dumps(self.manifest))

    def run_package(self, output=None, tag=None):
        command = [sys.executable, str(self.root / 'scripts' / 'package.py')]
        if output is not None:
            command += ['--output', str(output)]
        environment = os.environ.copy()
        environment.pop('RELEASE_TAG', None)
        if tag is not None:
            environment['RELEASE_TAG'] = tag
        return subprocess.run(command, cwd=self.root, env=environment,
                              capture_output=True, text=True)

    def assert_succeeded(self, result):
        self.assertEqual(result.returncode, 0, result.stderr)

    def assert_rejected(self, output, tag=None):
        result = self.run_package(output, tag)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertFalse(output.exists(), 'invalid inputs must not produce release files')

    def test_archive_uses_installable_allowlist_and_excludes_repo_data(self):
        (self.root / 'README.md').write_text('repository documentation')
        (self.root / '.env').write_text('PRIVATE=test fixture')
        (self.root / 'private.pem').write_text('fixture private material')
        (self.extension / 'assets' / '.DS_Store').write_bytes(b'mac metadata')
        output = self.root / 'artifacts'
        self.assert_succeeded(self.run_package(output))
        with zipfile.ZipFile(output / 'image-collector-1.0.0.zip') as archive:
            self.assertEqual(archive.namelist(), sorted((*RUNTIME_FILES, 'LICENSE')))
            self.assertEqual(json.loads(archive.read('manifest.json'))['version'], '1.0.0')
            self.assertEqual(archive.read('LICENSE'), b'MIT test license\n')
            for name in RUNTIME_FILES:
                self.assertEqual(archive.read(name), (self.extension / name).read_bytes())

    def test_build_is_reproducible_including_alias_and_checksums(self):
        first, second = self.root / 'first', self.root / 'second'
        self.assert_succeeded(self.run_package(first, tag='v1.0.0'))
        for name in RUNTIME_FILES:
            path = self.extension / name
            os.utime(path, (1800000000, 1800000000))
            path.chmod(0o600)
        self.assert_succeeded(self.run_package(second, tag='v1.0.0'))
        versioned = first / 'image-collector-1.0.0.zip'
        alias = first / 'image-collector.zip'
        self.assertEqual(versioned.read_bytes(), alias.read_bytes())
        for name in ('image-collector-1.0.0.zip', 'image-collector.zip', 'SHA256SUMS.txt'):
            self.assertEqual((first / name).read_bytes(), (second / name).read_bytes())
        digest = hashlib.sha256(versioned.read_bytes()).hexdigest()
        self.assertEqual((first / 'SHA256SUMS.txt').read_text(),
                         f'{digest}  image-collector-1.0.0.zip\n'
                         f'{digest}  image-collector.zip\n')
        with zipfile.ZipFile(versioned) as archive:
            for entry in archive.infolist():
                self.assertEqual(entry.date_time, (1980, 1, 1, 0, 0, 0))
                self.assertEqual(entry.external_attr >> 16, 0o100644)

    def test_default_output_is_dist(self):
        self.assert_succeeded(self.run_package())
        self.assertTrue((self.root / 'dist' / 'image-collector.zip').is_file())

    def test_release_tag_must_match_manifest_version_exactly(self):
        for index, tag in enumerate(('', '1.0.0', 'v1.0.1', 'v1.0.0\n')):
            with self.subTest(tag=repr(tag)):
                self.assert_rejected(self.root / f'bad-tag-{index}', tag)

    def test_manifest_controls_release_version(self):
        self.manifest['version'] = '2.3.4'
        self.write_manifest()
        output = self.root / 'versioned'
        self.assert_succeeded(self.run_package(output, tag='v2.3.4'))
        self.assertTrue((output / 'image-collector-2.3.4.zip').is_file())
        self.assertFalse((output / 'image-collector-1.0.0.zip').exists())

    def test_unexpected_extension_files_are_rejected_without_packaging_secrets(self):
        for index, name in enumerate(('private.pem', 'pages/user-data.json', 'assets/.env')):
            with self.subTest(name=name):
                path = self.extension / name
                path.write_text('private fixture value')
                self.assert_rejected(self.root / f'extra-{index}')
                path.unlink()

    def test_unexpected_empty_extension_directory_is_rejected(self):
        (self.extension / 'user-data').mkdir()
        self.assert_rejected(self.root / 'extra-directory')

    def test_symlinked_runtime_file_is_rejected(self):
        outside = self.root / 'private.pem'
        outside.write_text('private fixture value')
        link = self.extension / 'assets' / 'logo.png'
        link.unlink()
        link.symlink_to(outside)
        self.assert_rejected(self.root / 'linked-file')

    def test_symlinked_runtime_directory_is_rejected(self):
        outside = self.root / 'pages-copy'
        (self.extension / 'pages').rename(outside)
        (self.extension / 'pages').symlink_to(outside, target_is_directory=True)
        self.assert_rejected(self.root / 'linked-directory')

    def test_symlinked_extension_root_is_rejected(self):
        outside = self.root / 'extension-copy'
        self.extension.rename(outside)
        self.extension.symlink_to(outside, target_is_directory=True)
        self.assert_rejected(self.root / 'linked-extension')

    def test_symlinked_license_is_rejected(self):
        outside = self.root / 'private.pem'
        outside.write_text('private fixture value')
        (self.root / 'LICENSE').unlink()
        (self.root / 'LICENSE').symlink_to(outside)
        self.assert_rejected(self.root / 'linked-license')

    def test_symlinked_ds_store_is_rejected(self):
        outside = self.root / 'private.pem'
        outside.write_text('private fixture value')
        (self.extension / '.DS_Store').symlink_to(outside)
        self.assert_rejected(self.root / 'linked-metadata')

    def test_output_cannot_be_inside_extension(self):
        self.assert_rejected(self.extension / 'dist')

    def test_output_symlink_cannot_resolve_inside_extension(self):
        output = self.root / 'linked-output'
        output.symlink_to(self.extension, target_is_directory=True)
        result = self.run_package(output)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertFalse((self.extension / 'image-collector.zip').exists())

    def test_manifest_v3_is_required(self):
        self.manifest['manifest_version'] = 2
        self.write_manifest()
        self.assert_rejected(self.root / 'manifest-v2')

    def test_required_manifest_resources_must_be_in_the_installable_archive(self):
        cases = (
            ('background', {'service_worker': 'missing.js', 'type': 'module'}),
            ('background', {}),
            ('action', {'default_popup': 'pages/missing.html'}),
            ('action', {}),
            ('icons', {'128': '../private.pem'}),
            ('action', {'default_popup': 'pages/popup.html',
                        'default_icon': {'16': 'assets/missing.png'}}),
        )
        original = dict(self.manifest)
        for index, (key, value) in enumerate(cases):
            with self.subTest(resource=key, value=value):
                self.manifest = dict(original, **{key: value})
                self.write_manifest()
                self.assert_rejected(self.root / f'missing-resource-{index}')

    def test_missing_runtime_file_is_rejected(self):
        (self.extension / 'utils' / 'hash.js').unlink()
        self.assert_rejected(self.root / 'missing-runtime')

    def test_invalid_manifest_versions_are_rejected(self):
        for index, version in enumerate((1, '', '1.0.0-beta', '1.0.0.0.0',
                                         '65536.0', '0', '0.0.0')):
            with self.subTest(version=version):
                self.manifest['version'] = version
                self.write_manifest()
                self.assert_rejected(self.root / f'invalid-version-{index}')

    def test_empty_license_is_rejected(self):
        (self.root / 'LICENSE').write_text('')
        self.assert_rejected(self.root / 'empty-license')


if __name__ == '__main__':
    unittest.main()
