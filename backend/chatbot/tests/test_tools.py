from chatbot import tools
from chatbot.tools import validate_tool_call as v

# --- select_site ------------------------------------------------------------
def test_select_site_ok_and_normalized():
    r = v("select_site", {"name": " shackleton-RIM "})
    assert r.ok and r.args == {"id": "shackleton_rim", "name": "Shackleton Rim"}

def test_select_site_unknown_has_no_crash():
    r = v("select_site", {"name": "Narnia"})
    assert not r.ok and "Unknown region" in r.error

def test_select_site_ambiguous_gives_suggestions():
    r = v("select_site", {"name": "Connecting Rid"})
    assert r.ok or r.suggestions  # either a confident match or suggestions to ask the user

def test_select_site_empty_or_wrong_type():
    assert not v("select_site", {}).ok
    assert not v("select_site", {"name": 42}).ok


# --- set_date ---------------------------------------------------------------
def test_set_date_ok():
    assert v("set_date", {"date": "2027-03-12"}).args == {"date": "2027-03-12"}

def test_set_date_bad_format_and_impossible():
    assert not v("set_date", {"date": "12/03/2027"}).ok
    assert not v("set_date", {"date": "2027-02-30"}).ok
    assert not v("set_date", {}).ok

def test_set_date_out_of_range():
    r = v("set_date", {"date": "2099-01-01"})
    assert not r.ok and "outside the data range" in r.error


# --- compare_sites ----------------------------------------------------------
def test_compare_ok():
    r = v("compare_sites", {"names": ["Shackleton Rim", "malapert massif"]})
    assert r.ok and r.args["ids"] == ["shackleton_rim", "malapert_massif"]

def test_compare_needs_two_distinct():
    assert not v("compare_sites", {"names": ["Shackleton Rim"]}).ok
    assert not v("compare_sites", {"names": ["Shackleton Rim", "shackleton_rim"]}).ok

def test_compare_too_many():
    names = ["Shackleton Rim", "Malapert Massif", "Connecting Ridge", "Connecting Ridge Extension"]
    assert not v("compare_sites", {"names": names}).ok

def test_compare_unknown_and_unscored():
    assert not v("compare_sites", {"names": ["Shackleton Rim", "Narnia"]}).ok
    r = v("compare_sites", {"names": ["Shackleton Rim", "No Data Site"]})
    assert not r.ok and "No data yet" in r.error

def test_compare_bad_types():
    assert not v("compare_sites", {"names": "Shackleton Rim"}).ok


# --- set_view ---------------------------------------------------------------
def test_set_view():
    assert v("set_view", {"view": "site"}).ok
    assert not v("set_view", {"view": "matrix"}).ok
    assert not v("set_view", {}).ok


# --- whitelist / robustness -------------------------------------------------
def test_unknown_tool_and_bad_args():
    assert not v("delete_all", {}).ok
    assert not v("select_site", "Shackleton").ok

def test_batch_helper_splits_approved_and_rejected():
    out = tools.validate_tool_calls([
        {"name": "select_site", "args": {"name": "Shackleton Rim"}},
        {"name": "set_view", "args": {"view": "nope"}},
    ])
    assert out["actions"] == [{"type": "select_site", "args": {"id": "shackleton_rim", "name": "Shackleton Rim"}}]
    assert len(out["rejected"]) == 1

def test_schemas_consistent():
    names = {t["name"] for t in tools.get_tools()}
    assert names == set(tools.VALIDATORS)
    assert {t["function"]["name"] for t in tools.to_openai_tools()} == names