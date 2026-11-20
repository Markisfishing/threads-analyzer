"""中英文斷詞、停用詞、情緒詞典（PRD F5 關鍵字、F6 NLP）。"""
from __future__ import annotations

import logging
import re
from functools import lru_cache

from worker.cleaning import HASHTAG_RE, MENTION_RE, URL_RE

STOPWORDS = frozenset("""
的 了 是 我 你 他 她 它 我們 你們 他們 這 那 這個 那個 和 與 及 或 也 都 就 還 而 在 有 沒有 沒 不 很 會 要 能 可以 嗎 呢 吧 啊 喔 哦 啦 呀 欸 嗯 一 一個 一些 什麼 怎麼 為什麼 因為 所以 但是 但 如果 然後 還是 已經 自己 大家 今天 現在 這樣 那樣 真的 其實 就是 不是 只是 可能 應該 一下 一起 時候 東西 覺得 知道 看到 來 去 說 讓 被 把 給 對 跟 從 到 上 下 中 裡 後 前 多 少 好 更 最 太 再 又 才 等 等等 之 其 於 以 為 着 著 過 個 們 些 啥
a an the and or but if then so of to in on at for with from by as is are was were be been being am do does did
this that these those it its i me my we our you your he him his she her they them their what which who whom how
not no yes just very really can could will would should may might must have has had about into over more most
some any all also than too here there when where why up down out off again only own same such each other both
get got go going make made like one two new s t ll re ve d m
us see seen things thing lot now real time think thought way want know need still even much well back first today
we're i'm it's don't you're that's there's let's can't i've we've they're isn't doesn't didn't won't i'll we'll
""".split())

POSITIVE = frozenset("""
好 讚 棒 喜歡 愛 開心 快樂 感謝 謝謝 感恩 期待 推薦 成功 厲害 漂亮 美 有趣 幸福 驚喜 興奮 支持 恭喜 優秀 完美 值得 舒服 溫暖 希望 精彩
love great amazing awesome happy excited thanks thank good best beautiful fun proud congrats congratulations win wonderful
excellent incredible cool nice enjoy glad brilliant fantastic perfect
""".split())

NEGATIVE = frozenset("""
不好 爛 差 討厭 難過 生氣 失望 可惜 糟 糟糕 煩 累 痛 怕 擔心 問題 失敗 錯 壞 慘 抱歉 遺憾 崩潰 無聊 困難 焦慮 傷心 後悔
bad worst hate sad angry disappointed sorry problem fail failed failure wrong terrible awful boring hard worry worried
pain difficult annoying broken issue
""".split())

WORD_RE = re.compile(r"[A-Za-z][A-Za-z']+|[一-鿿㐀-䶿]+|\d+")


@lru_cache(maxsize=1)
def _jieba():
    import jieba

    jieba.setLogLevel(logging.WARNING)
    return jieba


def strip_entities(text: str) -> str:
    return MENTION_RE.sub(" ", HASHTAG_RE.sub(" ", URL_RE.sub(" ", text or "")))


def tokenize(text: str) -> list[str]:
    """斷詞：中文用 jieba、英文轉小寫；移除 URL、hashtag、mention。"""
    tokens: list[str] = []
    for chunk in WORD_RE.findall(strip_entities(text)):
        if chunk[0].isascii():
            tokens.append(chunk.lower())
        else:
            tokens.extend(w for w in _jieba().lcut(chunk) if w.strip())
    return tokens


def keywords(text: str) -> list[str]:
    """關鍵字候選：去停用詞、數字、單字元。"""
    return [t for t in tokenize(text) if len(t) > 1 and not t.isdigit() and t not in STOPWORDS]


def sentiment(text: str) -> int:
    """詞典法情緒：+1 正向、-1 負向、0 中性。"""
    toks = tokenize(text)
    pos = sum(1 for t in toks if t in POSITIVE)
    neg = sum(1 for t in toks if t in NEGATIVE)
    return (pos > neg) - (neg > pos)
