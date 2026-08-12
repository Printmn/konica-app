"""
The web service.

Two routes and a static page. Kept small on purpose: everything interesting is
in `geometry.py` and `pipeline.py`, which have no web framework in them and can
be run from a script or a batch job just as easily.

    pip install -r requirements.txt
    uvicorn server:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from geometry import SIZES
from pipeline import BACKGROUNDS, PhotoError, process

#: 20 MB. A phone photo is 3–8 MB; anything past this is a mistake, and it is
#: cheaper to say so than to hand it to the segmentation model.
MAX_BYTES = 20 * 1024 * 1024

HERE = Path(__file__).parent
STATIC = HERE / 'static'

app = FastAPI(title='Цээж зураг', docs_url='/api/docs')


@app.get('/api/sizes')
def sizes() -> dict[str, object]:
    """What the page builds its buttons from, so the two can never disagree."""
    return {
        'sizes': [
            {
                'key': size.key,
                'label': size.label,
                'widthMm': size.width_mm,
                'heightMm': size.height_mm,
                'pixels': size.pixels(),
            }
            for size in SIZES.values()
        ],
        'backgrounds': list(BACKGROUNDS),
    }


@app.post('/api/process')
async def process_photo(
    photo: UploadFile = File(...),
    size: str = Form('3x4'),
    background: str = Form('white'),
    dpi: int = Form(300),
    remove_background: bool = Form(True),
) -> Response:
    data = await photo.read()
    if not data:
        raise HTTPException(400, 'Зураг хоосон байна.')
    if len(data) > MAX_BYTES:
        raise HTTPException(413, 'Зураг хэт том байна (20MB-аас бага байх ёстой).')

    try:
        result = process(
            data,
            size_key=size,
            background=background,
            dpi=dpi,
            remove_background=remove_background,
        )
    except PhotoError as error:
        # These are the counter's problems, not the server's — a plain message
        # in Mongolian, and a 400 so the page can show it as guidance.
        raise HTTPException(400, str(error)) from error

    body = result.to_bytes('JPEG')
    return Response(
        content=body,
        media_type='image/jpeg',
        headers={
            'Content-Disposition': f'attachment; filename="photo-{result.size.key}.jpg"',
            # The page reads these to tell the clerk what it did, without
            # needing a second round trip for a JSON summary.
            'X-Head-Share': f'{result.head_share:.3f}',
            'X-Eye-From-Bottom': f'{result.eye_from_bottom:.3f}',
            'X-Background-Removed': '1' if result.background_removed else '0',
            'X-Pixels': '{}x{}'.format(*result.size.pixels(result.dpi)),
            'Access-Control-Expose-Headers': (
                'X-Head-Share, X-Eye-From-Bottom, X-Background-Removed, X-Pixels'
            ),
        },
    )


@app.get('/')
def index() -> FileResponse:
    return FileResponse(STATIC / 'index.html')


app.mount('/static', StaticFiles(directory=STATIC), name='static')
