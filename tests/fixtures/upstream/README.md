# Fixed upstream test baseline

These files are exact copies from Project F (F.LF), commit
`21341737e4154d06d9784e9a629c9dd4db9148d6`:
https://github.com/Project-F/F.LF/tree/21341737e4154d06d9784e9a629c9dd4db9148d6

Only the immediate `LF/*.js` and `core/*.js` runtime modules and their GNU GPL v3
license are included. `manifest.json` records the byte count and SHA-256 of every
upstream file. The license and original inline notices are preserved.

These fixtures are deliberately independent of the modified production files in
`vendor/`. Native behavior comparisons must read this fixed baseline rather than
Git `HEAD`, so the tests also run in a normal clone, source archive, or flat
repository without embedded Git metadata.

To reproduce a file from an upstream checkout, use:

```sh
git show 21341737e4154d06d9784e9a629c9dd4db9148d6:LF/character.js
```

Do not refresh these fixtures from the working tree. A future baseline change
must name a new upstream commit and update the integrity manifest explicitly.
