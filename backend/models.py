from datetime import datetime
import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, field_validator, model_validator


MAX_SAFE_INTEGER = 9_007_199_254_740_991
Count = Annotated[StrictInt, Field(ge=0, le=MAX_SAFE_INTEGER)]
PositiveCount = Annotated[StrictInt, Field(ge=1, le=MAX_SAFE_INTEGER)]
Name = Annotated[str, Field(min_length=1, max_length=200)]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(Model):
    username: Annotated[str, Field(min_length=1, max_length=100)]
    password: Annotated[str, Field(min_length=1, max_length=256)]

    # Password whitespace is significant, unlike other user-entered strings.
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


class InvitationCreate(Model):
    name: Name
    events: Literal["wedding", "both"]


class InvitationUpdate(Model):
    name: Name | None = None
    events: Literal["wedding", "both"] | None = None
    active: StrictBool | None = None
    expectedUpdatedAt: Annotated[str, Field(min_length=1, max_length=40)] | None = None

    @model_validator(mode="after")
    def nonempty(self):
        if not (self.model_fields_set - {"expectedUpdatedAt"}) or any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Provide at least one non-null invitation field.")
        return self


class Transportation(Model):
    wedding: StrictBool
    reception: StrictBool


class Accommodation(Model):
    required: StrictBool
    rooms: PositiveCount | None

    @model_validator(mode="after")
    def consistent(self):
        if not self.required and self.rooms is not None:
            raise ValueError("Rooms require accommodation to be requested.")
        return self


class RsvpPayload(Model):
    schemaVersion: Literal[1]
    occasion: Literal["visakh-archana-2027-02-11"]
    submissionId: Annotated[str, Field(min_length=16, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]
    respondedAt: Annotated[str, Field(max_length=40)]
    fullName: Name
    contact: Annotated[str, Field(min_length=1, max_length=254)]
    attending: StrictBool
    guestCount: Count
    events: Annotated[list[Literal["wedding", "reception"]], Field(max_length=2)]
    transportation: Transportation
    accommodation: Accommodation
    foodAllergies: Annotated[str, Field(max_length=2000)]
    message: Annotated[str, Field(max_length=5000)]

    @field_validator("respondedAt")
    @classmethod
    def valid_timestamp(cls, value):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("A timestamp with a timezone is required.")
        return value

    @field_validator("contact")
    @classmethod
    def valid_contact(cls, value):
        if "@" in value:
            valid = bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value))
        else:
            valid = bool(re.fullmatch(r"[+\d\s().-]+", value)) and 7 <= len(re.sub(r"\D", "", value)) <= 15
        if not valid:
            raise ValueError("Enter a valid email address or phone number.")
        return value

    @model_validator(mode="after")
    def consistent_response(self):
        if len(set(self.events)) != len(self.events):
            raise ValueError("Celebrations cannot be repeated.")
        if self.attending:
            if self.guestCount < 1 or not self.events:
                raise ValueError("Attendance requires at least one guest and celebration.")
        elif self.guestCount != 0 or self.events or self.accommodation.required or self.foodAllergies:
            raise ValueError("Declined responses cannot request guest, celebration, accommodation or dietary arrangements.")
        if self.transportation.wedding and "wedding" not in self.events:
            raise ValueError("Wedding transport requires wedding attendance.")
        if self.transportation.reception and "reception" not in self.events:
            raise ValueError("Reception transport requires reception attendance.")
        return self
